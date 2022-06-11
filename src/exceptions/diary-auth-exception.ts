export class DiaryAuthException {
  public statusCode : number;
  private data: any;

  constructor(statusCode: number, data: any) {
    this.statusCode = statusCode;
    this.data = data;
  }
}

