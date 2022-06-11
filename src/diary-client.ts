import {
  AuthRequest,
  AuthResult,
  AuthStatus,
  Diary,
  DiaryEntry,
  ShareDiaryEntryRequest,
  SharingTask,
  ShortDiaryEntry,
} from "./types";
import {IDiaryClient} from "./diary-client-interface";
import Encryption from "./encryption/encryption";
import {DiaryAuthException} from "./exceptions/diary-auth-exception";
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
  ShortDiaryEntryDto, UpdateDiaryEntryRequest,
  UsersApiFp
} from "./base-client";
import {AxiosResponse} from "axios";
import jwt_decode, {JwtPayload} from "jwt-decode";
import {SharingTaskNotFoundException} from "./exceptions/sharing-task-not-found-exception";

export interface IKeyStorage {
  set<T>(key: string, value: T): void;
  get<T>(key: string): T;
  removeByPrefix(prefix: string): void;
}

const masterKeyKey = "mk-2ffb2fe3-20fe-4c3e-b421-6ec7c1d33415";
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

  async register(req: AuthRequest): Promise<AuthResult> {
    const saltBytes = Encryption.generateSalt();
    const masterKey = Encryption.getMasterKey(req.password, saltBytes);

    const {publicKey, privateKey} = Encryption.generateRsaKeyPair()
    const encryptedPrivateKeyBytes = Encryption.encryptAes(masterKey, Buffer.from(privateKey));

    const diaryKey = Encryption.generateKey();
    const encryptedDiaryKeyBytes = Encryption.encryptAes(masterKey, diaryKey);

    const request: RegisterRequest = {
      username: req.username,
      password: req.password,
      masterKeySalt: Encryption.bytesToText(saltBytes),
      publicKeyForSharing: publicKey,
      encryptedPrivateKeyForSharing: Encryption.bytesToText(encryptedPrivateKeyBytes),
      encryptedDiaryKey: Encryption.bytesToText(encryptedDiaryKeyBytes),
    }

    const sendRequest = await AuthApiFp(this.getConfiguration()).v1AuthRegisterPost(request);

    const response = await sendRequest();
    ensureSuccess(response);

    this.clearKeys();
    this.keysStorage.set(accessTokenKey, response.data.token);
    this.keysStorage.set(masterKeyKey, masterKey);
    this.keysStorage.set(privateKeyKey, privateKey);
    this.setDiaryKey(response.data.diaryId, diaryKey);

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
    const masterKey = Encryption.getMasterKey(req.password, Buffer.from(myInfo.masterKeySalt));
    const privateKey = Encryption.decryptAes(masterKey, Buffer.from(myInfo.encryptedPrivateKeyForSharing));
    this.keysStorage.set(masterKeyKey, masterKey);
    this.keysStorage.set(privateKeyKey, privateKey);

    return {authStatus: AuthStatus.Authorized};
  }

  async getDiaries(): Promise<Diary[]> {
    const sendRequest = await DiariesApiFp(this.getConfiguration()).v1DiariesGet();
    const response = await sendRequest();
    ensureSuccess(response);

    const diaries = response.data.items;
    const masterKey = this.getMasterKey();
    diaries?.forEach(d => {
      const key = Encryption.decryptAes(masterKey, Buffer.from(d.key));
      this.keysStorage.set(d.id, key)
    })

    return response.data.items.map((d: DiaryDto) => ({
      id: d.id,
      name: d.name,
      ownerId: d.ownerId,
    }));
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

    const diaryKey = Encryption.decryptRsa(privateKey, Buffer.from(task.encryptedDiaryKey));
    this.setDiaryKey(diaryId, diaryKey);

    const myEncryptedDiaryKey = Encryption.encryptAes(masterKey, diaryKey);
    const encryptedKeyStr = Encryption.bytesToText(myEncryptedDiaryKey);
    const req: AcceptSharedDiaryRequest = {diaryId, encryptedDiaryKey: encryptedKeyStr};
    const send = await sharingTasksApi.v1SharingTasksAcceptPost(req);
    const acceptResponse = await send();
    ensureSuccess(acceptResponse);
  }

  async createDiaryEntry(req: CreateDiaryEntryRequest): Promise<ShortDiaryEntryDto> {
    const send = await DiaryEntriesApiFp(this.getConfiguration()).v1DiaryEntriesPost(req);
    const response = await send();
    ensureSuccess(response);
    return response.data;
  }

  async deleteDiaryEntry(id: string): Promise<void> {
    const send = await DiaryEntriesApiFp(this.getConfiguration()).v1DiaryEntriesIdDelete(id);
    const response = await send();
    ensureSuccess(response);
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
    return {
      id: entry.id,
      diaryId: entry.diaryId,
      name: entry.name,
      date: new Date(entry.date),
      value: entry.value,
      blocks: entry.blocks.map((b: DiaryEntryBlockDto) => ({
        id: b.id,
        value: b.value,
      }))
    }
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

  isLoggedIn(): boolean {
    const token = this.keysStorage.get<string>(accessTokenKey);
    if (token === "") {
      return false
    }
    const decoded = jwt_decode<JwtPayload>(token);
    const expTime = new Date(decoded.exp!);
    return expTime > new Date();
  }

  async shareDiaryEntry(req: ShareDiaryEntryRequest): Promise<DiaryEntry> {
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

    const decrypt = (value: string): Uint8Array => {
      return Encryption.decryptAes(diaryKey, Buffer.from(value));
    }
    const encrypt = (value: Uint8Array): string => {
      return Encryption.bytesToText(Encryption.encryptAes(newDiaryKey, value));
    }
    const rawValue = decrypt(entry.value);
    const rawBlocks = entry.blocks.map((b) => ({
      id: b.id,
      value: Encryption.bytesToText(decrypt(b.value)),
    }))
    const updatedEntryValue = encrypt(rawValue);
    const updatedBlocks = rawBlocks.map((rawBlock) => ({
      id: rawBlock.id,
      value: encrypt(Buffer.from(rawBlock.value)),
    }))
    const myDiaryKey = Encryption.encryptAes(this.getMasterKey(), newDiaryKey);
    const receiverDiaryKey = Encryption.encryptRsa(publicKey, newDiaryKey);

    const request : CreateSharingTaskRequest = {
      entryId: req.diaryEntryId,
      receiverUserId: req.receiverUserId,
      myEncryptedKey: Encryption.bytesToText(myDiaryKey),
      receiverEncryptedKey: Encryption.bytesToText(receiverDiaryKey),
      value: updatedEntryValue,
      blocks: updatedBlocks,
    }
    const shareResponse = await (await tasksApi.v1SharingTasksPost(request))();
    ensureSuccess(shareResponse);
    this.setDiaryKey(shareResponse.data.diaryId, newDiaryKey);
    return {
      id: entry.id,
      diaryId: shareResponse.data.diaryId,
      name: entry.name,
      date: new Date(entry.date),
      value: Encryption.bytesToText(rawValue),
      blocks: rawBlocks,
    }
  }

  async updateDiaryEntry(id: string, req: UpdateDiaryEntryRequest): Promise<ShortDiaryEntry> {
    const entriesApi = DiaryEntriesApiFp(this.getConfiguration());
    const entryResponse = await (await entriesApi.v1DiaryEntriesIdGet(id))();
    ensureSuccess(entryResponse);

    const diaryKey = this.getDiaryKey(entryResponse.data.diaryId);
    const encrypt = (value: string) : string => {
      return Encryption.bytesToText(Encryption.encryptAes(diaryKey, Buffer.from(value)))
    }
    req.blocksToUpsert = req.blocksToUpsert?.map((b) => ({
      id: b.id,
      value: encrypt(b.value),
    }));

    const sendRequest = await entriesApi.v1DiaryEntriesIdPatch(id, req);
    const updateResponse = await sendRequest();
    ensureSuccess(updateResponse);
    const updatedEntry = updateResponse.data;

    return {
      id: updatedEntry.id,
      diaryId: updatedEntry.diaryId,
      name: updatedEntry.name,
      date: new Date(updatedEntry.date),
    }
  }

  private getMasterKey(): Uint8Array {
    return this.keysStorage.get<Uint8Array>(masterKeyKey);
  }

  private getPrivateKey(): string {
    return this.keysStorage.get<string>(privateKeyKey);
  }

  private getDiaryKey(diaryId: string): Uint8Array {
    return this.keysStorage.get<Uint8Array>(`${diaryKeyPrefix}${diaryId}`);
  }

  private setDiaryKey(diaryId: string, diaryKey: Uint8Array) {
    return this.keysStorage.set<Uint8Array>(`${diaryKeyPrefix}${diaryId}`, diaryKey);
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
  if (response.status !== 200)
    throw new DiaryAuthException(response.status, response.data);
}

const dateToString = (date?: Date) => {
  if (!date) {
    return undefined;
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
