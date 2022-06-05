export interface AuthRequest {
  username: string;
  password: string;
}

export enum AuthStatus {
  Authorized,
  IncorrentUsernameOrPassword
}

export interface AuthResult {
  authStatus: AuthStatus;
}

export interface Diary {
  id: string;
  name: string;
}

export interface ShortDiaryEntry {
  id: string;
  diaryId: string;
  name: string;
  date: Date;
}

export interface DiaryEntry extends ShortDiaryEntry {
  value: string[];
  blocks: []
}

interface DiaryEntryBlock {
  id?: string;
  value: Map<string, any>;
}

export interface CreateDiaryEntryRequest {
  name: string;
  date: Date;
  blocks: DiaryEntryBlock[];
}

export interface UpdateDiaryEntryRequest {
  name: string;
  date: Date;
  blocks: DiaryEntryBlock[];
}

export interface ShareDiaryEntryRequest {
  diaryEntryId: string;
  receiverUserId: string;
}

export interface SharingTask {
    diaryId: string;
    userId: string;
    username: string;
    sharedAt: Date;
}