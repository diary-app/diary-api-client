import { DiaryBadRequestException } from './diary-bad-request-exception';

export class SharingTaskNotFoundException extends DiaryBadRequestException {
  constructor(diaryId: string) {
    super(`sharing task for diary ${diaryId} was not found`);
  }
}