import {
  AuthRequest,
  AuthResult,
  Diary,
  DiaryEntry,
  ShareDiaryEntryRequest,
  SharingTask,
  ShortDiaryEntry,
} from "./types";
import { CreateDiaryEntryRequest, ShortDiaryEntryDto, ShortUserDto, UpdateDiaryEntryRequest } from './base-client';

export interface IDiaryClient {
  isLoggedIn(): boolean;

  register(req: AuthRequest): Promise<AuthResult>;

  login(req: AuthRequest): Promise<AuthResult>;

  getUser(name: string): Promise<ShortUserDto>;

  getDiaries(): Promise<Diary[]>;

  getEntries(diaryId?: string, date?: Date): Promise<ShortDiaryEntry[]>;

  getEntry(id: string): Promise<DiaryEntry>;

  createDiaryEntry(req: CreateDiaryEntryRequest): Promise<ShortDiaryEntryDto>;

  updateDiaryEntry(id: string, req: UpdateDiaryEntryRequest): Promise<ShortDiaryEntry>;

  deleteDiaryEntry(id: string): Promise<void>;

  getSharingTasks(): Promise<SharingTask[]>;

  shareDiaryEntry(req: ShareDiaryEntryRequest): Promise<string>;

  acceptSharingTask(diaryId: string): Promise<void>;
}