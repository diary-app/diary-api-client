export class SharingTaskNotFoundException {
  private diaryId: string;

  constructor(diaryId: string) {
    this.diaryId = diaryId;
  }
}