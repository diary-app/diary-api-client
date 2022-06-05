import {
  AuthRequest,
  AuthResult,
  AuthStatus,
  CreateDiaryEntryRequest,
  Diary,
  DiaryEntry,
  ShareDiaryEntryRequest,
  SharingTask,
  ShortDiaryEntry,
  UpdateDiaryEntryRequest
} from "./types";
import axios from "axios";
import {IDiaryClient} from "./diary-client-interface";
import Encryption from "./encryption/encryption";
import {RegisterRequestDto, RegisterResponse} from "./dto";
import * as http from "http";
import {DiaryException} from "./exceptions";

export interface IKeyStorage {
  set<T>(key: string, value: T): void;
  get<T>(key: string): T;
}

const masterKeyKey = "mk-2ffb2fe3-20fe-4c3e-b421-6ec7c1d33415";

export class DiaryClient implements IDiaryClient {
  private readonly serverAddress: string;
  private readonly keysStorage: IKeyStorage;

  constructor(serverAddress: string, keyStorage: IKeyStorage) {
    this.serverAddress = serverAddress;
    this.keysStorage = keyStorage;
  }

  async register(req: AuthRequest): Promise<AuthResult> {
    const saltBytes = Encryption.generateSalt();
    const masterKey = Encryption.getMasterKey(req.password, saltBytes);

    const { publicKey, privateKey } = Encryption.generateRsaKeyPair()
    const encryptedPrivateKeyBytes = Encryption.encryptAes(masterKey, Buffer.from(privateKey));

    const diaryKey = Encryption.generateKey();
    const encryptedDiaryKeyBytes = Encryption.encryptAes(masterKey, diaryKey);

    const registerReq: RegisterRequestDto = {
      username: req.username,
      password: req.password,
      masterKeySalt: Encryption.bytesToText(saltBytes),
      publicKey,
      encryptedPrivateKey: Encryption.bytesToText(encryptedPrivateKeyBytes),
      encryptedDiaryKey: Encryption.bytesToText(encryptedDiaryKeyBytes),
    }

    const response = await axios.post<RegisterResponse>(`${this.serverAddress}/api/v1/auth/register`, registerReq);
    if (response.status !== 200)
      throw new DiaryException(response.status);

    this.keysStorage.set(masterKeyKey, masterKey);
    this.keysStorage.set(response.data.diaryId, diaryKey);

    return { authStatus: response.data.authStatus };
  }

  acceptSharingTask(diaryId: string, userId: string): Promise<void> {
    return Promise.resolve(undefined);
  }

  createDiaryEntry(req: CreateDiaryEntryRequest): Promise<DiaryEntry> {
    return Promise.resolve();
  }

  deleteDiaryEntry(id: string): Promise<void> {
    return Promise.resolve(undefined);
  }

  getDiaries(): Promise<Diary[]> {
    return Promise.resolve([]);
  }

  getEntries(diaryId?: string, date?: Date): Promise<ShortDiaryEntry[]> {
    Encryption.decryptAes()
    Encryption.decryptRsa()
    Encryption.encryptRsa()
    return Promise.resolve([]);
  }

  getEntry(id: string): Promise<DiaryEntry> {
    return Promise.resolve(undefined);
  }

  getSharingTasks(): Promise<SharingTask[]> {
    return Promise.resolve([]);
  }

  isLoggedIn(): boolean {
    return false;
  }

  login(req: AuthRequest): Promise<AuthResult> {
    return Promise.resolve(undefined);
  }

  shareDiaryEntry(req: ShareDiaryEntryRequest): Promise<DiaryEntry> {
    return Promise.resolve(undefined);
  }

  updateDiaryEntry(id: string, req: UpdateDiaryEntryRequest): Promise<DiaryEntry> {
    return Promise.resolve(undefined);
  }
}
