export default class DiaryIdNotFoundException {
  public readonly diaryId: string;

  constructor(diaryId: string){
    this.diaryId = diaryId;
  }
}