import {AuthStatus} from "./types";

export interface RegisterRequestDto {
  username: string;
  password: string;
  masterKeySalt: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedDiaryKey: string;
}

export interface RegisterResponse {
  authStatus: AuthStatus;
  diaryId: string;
}