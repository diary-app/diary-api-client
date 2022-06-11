import {
  AuthRequest,
  AuthResult,
  Diary,
  DiaryEntry,
  ShareDiaryEntryRequest,
  SharingTask,
  ShortDiaryEntry,
} from "./types";
import {CreateDiaryEntryRequest, ShortDiaryEntryDto, UpdateDiaryEntryRequest} from "./base-client";

export interface IDiaryClient {
  isLoggedIn(): boolean;

  register(req: AuthRequest): Promise<AuthResult>;

  login(req: AuthRequest): Promise<AuthResult>;

  getDiaries(): Promise<Diary[]>;

  getEntries(diaryId?: string, date?: Date): Promise<ShortDiaryEntry[]>;

  getEntry(id: string): Promise<DiaryEntry>;

  createDiaryEntry(req: CreateDiaryEntryRequest): Promise<ShortDiaryEntryDto>;

  updateDiaryEntry(id: string, req: UpdateDiaryEntryRequest): Promise<ShortDiaryEntry>;

  deleteDiaryEntry(id: string): Promise<void>;

  shareDiaryEntry(req: ShareDiaryEntryRequest): Promise<DiaryEntry>;

  getSharingTasks(): Promise<SharingTask[]>;

  acceptSharingTask(diaryId: string, userId: string): Promise<void>;
}