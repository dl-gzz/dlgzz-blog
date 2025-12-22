export interface SplitImage {
  id: string;
  amazon_url: string;
  type: string;
  url: string;
}

export interface OutfitData {
  id: string;
  url: string;
  local_url?: string;
  type: number;
  sex: 'male' | 'female';
  split_images: SplitImage[];
}

export type FilterType = 'all' | 'male' | 'female';
