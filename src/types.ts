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
  ownerId: string;
}

export interface ShortDiaryEntry {
  id: string;
  diaryId: string;
  name: string;
  date: Date;
}

export interface DiaryEntry extends ShortDiaryEntry {
  value: string;
  blocks: DiaryEntryBlock[]
}

interface DiaryEntryBlock {
  id: string;
  value: string;
}

export interface ShareDiaryEntryRequest {
  diaryEntryId: string;
  receiverUserId: string;
}

export interface SharingTask {
    diaryId: string;
    username: string;
    sharedAt: Date;
}