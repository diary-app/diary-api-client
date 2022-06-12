import {
  AuthRequest,
  AuthResult,
  AuthStatus,
  Diary,
  DiaryEntry,
  ShareDiaryEntryRequest,
  SharingTask,
  ShortDiaryEntry,
} from './types';
import { IDiaryClient } from './diary-client-interface';
import Encryption from './encryption/encryption';
import { DiaryApiException } from './exceptions/diary-api-exception';
import {
  AcceptSharedDiaryRequest,
  AuthApiFp,
  Configuration,
  CreateDiaryEntryRequest,
  CreateSharingTaskRequest,
  DiariesApiFp,
  DiaryDto,
  DiaryEntriesApiFp,
  DiaryEntryBlockDto,
  LoginRequest,
  RegisterRequest,
  SharingTaskDto,
  SharingTasksApiFp,
  ShortDiaryEntryDto,
  ShortUserDto,
  UpdateDiaryEntryRequest,
  UsersApiFp,
} from './base-client';
import { AxiosResponse } from 'axios';
import jwt_decode, { JwtPayload } from 'jwt-decode';
import { SharingTaskNotFoundException } from './exceptions/sharing-task-not-found-exception';
import DiaryIdNotFoundException from './exceptions/diary-id-not-found-exception';

export interface IKeyStorage {
  set<T>(key: string, value: T): void;
  get<T>(key: string): T;
  removeByPrefix(prefix: string): void;
}

const masterKeyKey = "diary-api.mk-2ffb2fe3-20fe-4c3e-b421-6ec7c1d33415";
const privateKeyKey = "diary-api.privateKey";
const accessTokenKey = "diary-api.accessTokenKey"
const diaryKeyPrefix = "diary-api.key:"

export class DiaryClient implements IDiaryClient {
  private readonly keysStorage: IKeyStorage;
  private readonly baseUri: string;

  constructor(
    keyStorage: IKeyStorage,
    baseUri: string) {
    this.keysStorage = keyStorage;
    this.baseUri = baseUri;
  }

  isLoggedIn(): boolean {
    const token = this.keysStorage.get<string>(accessTokenKey);
    if (token === "") {
      return false
    }
    const decoded = jwt_decode<JwtPayload>(token);
    const expTime = new Date(decoded.exp!);
    return expTime > new Date();
  }

  async register(req: AuthRequest): Promise<AuthResult> {
    const saltBytes = Encryption.generateSalt();
    const masterKeyBytes = Encryption.getMasterKey(req.password, saltBytes);

    const {publicKeyB64, privateKeyB64} = Encryption.generateRsaKeyPair()
    const encryptedPrivateKeyBytes = Encryption.encryptAes(masterKeyBytes, Encryption.utf8ToBytes(privateKeyB64));

    const diaryKeyBytes = Encryption.generateKey();
    const encryptedDiaryKeyBytes = Encryption.encryptAes(masterKeyBytes, diaryKeyBytes);

    const request: RegisterRequest = {
      username: req.username,
      password: req.password,
      masterKeySalt: Encryption.bytesToBase64(saltBytes),
      publicKeyForSharing: publicKeyB64,
      encryptedPrivateKeyForSharing: Encryption.bytesToBase64(encryptedPrivateKeyBytes),
      encryptedDiaryKey: Encryption.bytesToBase64(encryptedDiaryKeyBytes),
    }

    const sendRequest = await AuthApiFp(this.getConfiguration()).v1AuthRegisterPost(request);

    const response = await sendRequest();
    ensureSuccess(response);

    this.clearKeys();
    this.keysStorage.set(accessTokenKey, response.data.token);
    this.setMasterKey(masterKeyBytes);
    this.keysStorage.set(privateKeyKey, privateKeyB64);
    this.setDiaryKey(response.data.diaryId, diaryKeyBytes);

    return {authStatus: AuthStatus.Authorized};
  }

  async login(req: AuthRequest): Promise<AuthResult> {
    const request: LoginRequest = {
      username: req.username,
      password: req.password,
    };

    const sendRequest = await AuthApiFp(this.getConfiguration()).v1AuthLoginPost(request);
    const loginResponse = await sendRequest();
    ensureSuccess(loginResponse);

    this.clearKeys();
    this.keysStorage.set(accessTokenKey, loginResponse.data.token);

    const myInfoReq = await UsersApiFp(this.getConfiguration()).v1UsersMeGet();
    const myInfoResponse = await myInfoReq();
    ensureSuccess(myInfoResponse);

    const myInfo = myInfoResponse.data;
    const saltBytes = Encryption.base64ToBytes(myInfo.masterKeySalt);
    const encryptedPrivateKeyBytes = Encryption.base64ToBytes(myInfo.encryptedPrivateKeyForSharing);
    const masterKeyBytes = Encryption.getMasterKey(req.password, saltBytes);
    const privateKey = Encryption.bytesToUtf8(Encryption.decryptAes(masterKeyBytes, encryptedPrivateKeyBytes));
    this.setMasterKey(masterKeyBytes);
    this.keysStorage.set(privateKeyKey, privateKey);

    await this.getDiaries();

    return {authStatus: AuthStatus.Authorized};
  }

  async getUser(name: string): Promise<ShortUserDto> {
    const sendReq = await UsersApiFp(this.getConfiguration()).v1UsersNamenameGet(name);
    const response = await sendReq();
    ensureSuccess(response);
    return response.data;
  }

  async getDiaries(): Promise<Diary[]> {
    const sendRequest = await DiariesApiFp(this.getConfiguration()).v1DiariesGet();
    const response = await sendRequest();
    ensureSuccess(response);

    const diaries = response.data.items;
    const masterKey = this.getMasterKey();
    diaries?.forEach(d => {
      const key = Encryption.decryptAes(masterKey, Encryption.base64ToBytes(d.key));
      this.setDiaryKey(d.id, key);
    })

    return response.data.items.map((d: DiaryDto) => ({
      id: d.id,
      name: d.name,
      ownerId: d.ownerId,
    }));
  }

  async getEntries(diaryId?: string, date?: Date): Promise<ShortDiaryEntry[]> {
    const send = await DiaryEntriesApiFp(this.getConfiguration()).v1DiaryEntriesGet(diaryId, dateToString(date));
    const response = await send();
    ensureSuccess(response);
    return response.data.items.map((e: ShortDiaryEntryDto) => ({
      id: e.id,
      diaryId: e.diaryId,
      name: e.name,
      date: new Date(e.date),
    }));
  }

  async getEntry(id: string): Promise<DiaryEntry> {
    const send = await DiaryEntriesApiFp(this.getConfiguration()).v1DiaryEntriesIdGet(id);
    const response = await send();
    ensureSuccess(response);
    const entry = response.data;
    const diaryKey = this.getDiaryKey(entry.diaryId);
    const decrypt = (encrypted: string) : string => {
      return Encryption.bytesToUtf8(Encryption.decryptAes(diaryKey, Encryption.base64ToBytes(encrypted)));
    }
    return {
      id: entry.id,
      diaryId: entry.diaryId,
      name: entry.name,
      date: new Date(entry.date),
      value: decrypt(entry.value),
      blocks: entry.blocks.map((b: DiaryEntryBlockDto) => ({
        id: b.id,
        value: decrypt(b.value),
      }))
    }
  }

  async createDiaryEntry(req: CreateDiaryEntryRequest): Promise<ShortDiaryEntryDto> {
    const diaryKey = this.getDiaryKey(req.diaryId);
    req.value = Encryption.bytesToBase64(Encryption.encryptAes(diaryKey, Encryption.utf8ToBytes(req.value)));
    const send = await DiaryEntriesApiFp(this.getConfiguration()).v1DiaryEntriesPost(req);
    const response = await send();
    ensureSuccess(response);
    return {
      id: response.data.id,
      diaryId: req.diaryId,
      name: req.name,
      date: req.date,
    };
  }

  async updateDiaryEntry(id: string, req: UpdateDiaryEntryRequest): Promise<ShortDiaryEntry> {
    const entriesApi = DiaryEntriesApiFp(this.getConfiguration());
    const entryResponse = await (await entriesApi.v1DiaryEntriesIdGet(id))();
    ensureSuccess(entryResponse);
    const entry = entryResponse.data;

    const diaryKey = this.getDiaryKey(req.diaryId ?? entry.diaryId);
    const encrypt = (value: string) : string => {
      return Encryption.bytesToBase64(Encryption.encryptAes(diaryKey, Encryption.utf8ToBytes(value)))
    }
    req.blocksToUpsert = req.blocksToUpsert?.map((b) => ({
      id: b.id,
      value: encrypt(b.value),
    }));
    req.value = req.value ? encrypt(req.value) : undefined;

    if (req.diaryId && req.diaryId !== entry.diaryId) {
      const updatedOrDeletedBlocks = new Set<string>();
      req.blocksToUpsert?.forEach((b) => updatedOrDeletedBlocks.add(b.id));
      req.blocksToDelete?.forEach((i) => updatedOrDeletedBlocks.add(i));
      const oldDiaryKey = this.getDiaryKey(entry.diaryId);
      const reEncrypt = (value: string) : string => {
        const decrypted = Encryption.decryptAes(oldDiaryKey, Encryption.utf8ToBytes(value));
        return Encryption.bytesToBase64(Encryption.encryptAes(diaryKey, decrypted));
      }
      const blocksToReEncrypt = entry.blocks.filter((b) => !updatedOrDeletedBlocks.has(b.id));
      blocksToReEncrypt.forEach((b) => b.value = reEncrypt(b.value));
      req.blocksToUpsert = (req.blocksToUpsert ?? new Array<DiaryEntryBlockDto>()).concat(blocksToReEncrypt);
    }

    const sendRequest = await entriesApi.v1DiaryEntriesIdPatch(id, req);
    const updateResponse = await sendRequest();
    ensureSuccess(updateResponse);

    return {
      id: entry.id,
      diaryId: req.diaryId ?? entry.diaryId,
      name: req.name ?? entry.name,
      date: new Date(req.date ?? entry.date),
    }
  }

  async deleteDiaryEntry(id: string): Promise<void> {
    const send = await DiaryEntriesApiFp(this.getConfiguration()).v1DiaryEntriesIdDelete(id);
    const response = await send();
    ensureSuccess(response);
  }

  async getSharingTasks(): Promise<SharingTask[]> {
    const send = await SharingTasksApiFp(this.getConfiguration()).v1SharingTasksGet();
    const response = await send();
    ensureSuccess(response);

    return response.data.items.map((t: SharingTaskDto) => ({
      diaryId: t.diaryId,
      username: t.username,
      sharedAt: new Date(t.sharedAt),
    }));
  }

  async shareDiaryEntry(req: ShareDiaryEntryRequest): Promise<string> {
    const configuration = this.getConfiguration();
    const tasksApi = SharingTasksApiFp(configuration);
    const usersApi = UsersApiFp(configuration);
    const entriesApi = DiaryEntriesApiFp(configuration);

    const userResponse = await (await usersApi.v1UsersIdGet(req.receiverUserId))();
    ensureSuccess(userResponse);
    const publicKey = userResponse.data.publicKeyForSharing;

    const entryResponse = await (await entriesApi.v1DiaryEntriesIdGet(req.diaryEntryId))();
    ensureSuccess(entryResponse);

    const entry = entryResponse.data;
    const diaryKey = this.getDiaryKey(entry.diaryId);
    const newDiaryKey = Encryption.generateKey();

    const myDiaryKeyBytes = Encryption.encryptAes(this.getMasterKey(), newDiaryKey);
    const receiverDiaryKeyBytes = Encryption.encryptRsa(publicKey, newDiaryKey);

    const reEncrypt = (value: string): string => {
      const raw = Encryption.decryptAes(diaryKey, Encryption.base64ToBytes(value));
      return Encryption.bytesToBase64(Encryption.encryptAes(newDiaryKey, raw));
    }

    const updatedEntryValue = reEncrypt(entry.value);
    const updatedBlocks = entry.blocks.map((block) => ({
      id: block.id,
      value: reEncrypt(block.value),
    }))

    const request : CreateSharingTaskRequest = {
      entryId: req.diaryEntryId,
      receiverUserId: req.receiverUserId,
      myEncryptedKey: Encryption.bytesToBase64(myDiaryKeyBytes),
      receiverEncryptedKey: Encryption.bytesToBase64(receiverDiaryKeyBytes),
      value: updatedEntryValue,
      blocks: updatedBlocks,
    }

    const shareResponse = await (await tasksApi.v1SharingTasksPost(request))();
    ensureSuccess(shareResponse);
    this.setDiaryKey(shareResponse.data.diaryId, newDiaryKey);
    return shareResponse.data.diaryId;
  }

  async acceptSharingTask(diaryId: string): Promise<void> {
    const sharingTasksApi = SharingTasksApiFp(this.getConfiguration());
    const mySharingTasksResponse = await (await sharingTasksApi.v1SharingTasksGet())();
    ensureSuccess(mySharingTasksResponse);

    const task = mySharingTasksResponse.data.items.find(t => t.diaryId === diaryId);
    if (task == null)
      throw new SharingTaskNotFoundException(diaryId);

    const privateKey = this.getPrivateKey();
    const masterKey = this.getMasterKey();

    const diaryKeyBytes = Encryption.decryptRsa(privateKey, Encryption.base64ToBytes(task.encryptedDiaryKey));
    this.setDiaryKey(diaryId, diaryKeyBytes);

    const myEncryptedDiaryKey = Encryption.encryptAes(masterKey, diaryKeyBytes);
    const encryptedKeyStr = Encryption.bytesToBase64(myEncryptedDiaryKey);

    const req: AcceptSharedDiaryRequest = {diaryId, encryptedDiaryKey: encryptedKeyStr};
    const send = await sharingTasksApi.v1SharingTasksAcceptPost(req);
    const acceptResponse = await send();
    ensureSuccess(acceptResponse);
  }

  private getMasterKey(): Uint8Array {
    const masterKeyB64 = this.keysStorage.get<string>(masterKeyKey);
    return Encryption.base64ToBytes(masterKeyB64);
  }

  private setMasterKey(masterKeyBytes: Uint8Array) : void {
    const masterKeyB64 = Encryption.bytesToBase64(masterKeyBytes);
    this.keysStorage.set(masterKeyKey, masterKeyB64);
  }

  private getPrivateKey(): string {
    return this.keysStorage.get<string>(privateKeyKey);
  }

  private getDiaryKey(diaryId: string): Uint8Array {
    const keyB64 = this.keysStorage.get<string>(`${diaryKeyPrefix}${diaryId}`);
    if (keyB64 === "") {
      throw new DiaryIdNotFoundException(diaryId);
    }

    return Encryption.base64ToBytes(keyB64);
  }

  private setDiaryKey(diaryId: string, diaryKeyBytes: Uint8Array) {
    const keyB64 = Encryption.bytesToBase64(diaryKeyBytes);
    return this.keysStorage.set(`${diaryKeyPrefix}${diaryId}`, keyB64);
  }

  private clearKeys(): void {
    this.keysStorage.removeByPrefix(diaryKeyPrefix);
    this.keysStorage.removeByPrefix(accessTokenKey);
    this.keysStorage.removeByPrefix(masterKeyKey);
    this.keysStorage.removeByPrefix(privateKeyKey);
  }

  private getConfiguration() {
    return new Configuration({
      basePath: this.baseUri,
      accessToken: this.keysStorage.get<string>(accessTokenKey)
    });
  }
}

const ensureSuccess = (response: AxiosResponse) => {
  if (response.status < 200 || response.status >= 300)
    throw new DiaryApiException(response.status, response.data);
}

const dateToString = (date?: Date) => {
  if (!date) {
    return undefined;
  }
  const iso = date.toISOString();
  return iso.substring(0, iso.indexOf('T'));
}
