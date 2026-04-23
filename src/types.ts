/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'user' | 'developer' | 'owner';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber?: string;
  createdAt: number;
}

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  publisherId: string;
  publisherName: string;
  type: 'apk' | 'link';
  url: string; 
  category: 'ألعاب' | 'أدوات';
  imageUrl?: string;
  likes: string[]; 
  downloads: number;
  createdAt: number;
  rating?: number;
  reviewCount?: number;
}

export interface Review {
  id: string;
  appId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  timestamp: number;
}

export const OWNER_EMAIL = 'foxsd520@gmail.com';
export const PROJECT_NAME = 'FoxStore_1';
