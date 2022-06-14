import { DiaryBadRequestException } from './diary-bad-request-exception';

export default class DiaryKeyNotFoundException extends DiaryBadRequestException {
  constructor(diaryId: string) {
    super(`diary key for diary ${diaryId} was not found`);
  }
}