export interface ProfileDto {
  id: string;
  displayName: string;
  shareCode: string;
  avatarUrl: string | null;
}

export interface PublicProfileDto {
  id: string;
  displayName: string;
}
