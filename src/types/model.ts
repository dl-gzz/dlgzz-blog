// Database model type (from schema)
export interface CustomModelDB {
  id: string;
  name: string;
  height: string;
  weight: string;
  bodyType: string;
  style: string;
  imageUrl: string;
  ossKey: string;
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Frontend model type (unified for UI)
export interface Model {
  id: string;
  name: string;
  style: string;
  height: string;
  weight: string;
  body: string;
  image: string;
  selected: boolean;
  isCustom: boolean;
}

// Model creation form data
export interface CreateModelFormData {
  name: string;
  height: string;
  weight: string;
  bodyType: string;
  style: string;
  imageUrl: string;
  ossKey: string;
} 