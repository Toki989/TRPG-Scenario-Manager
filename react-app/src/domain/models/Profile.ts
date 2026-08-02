export interface Profile {
  id: string;
  displayName: string;
  shareCode: string;
  avatarPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}
