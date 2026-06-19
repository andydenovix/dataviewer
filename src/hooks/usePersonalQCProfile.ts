"use client";

import { useState, useEffect } from 'react';
import { QCProfile } from '@/types';
import { loadPersonalQCProfile, savePersonalQCProfile } from '@/lib/qcService';

interface UsePersonalQCProfileResult {
  profile: QCProfile | null;
  save: (p: QCProfile) => Promise<void>;
}

export function usePersonalQCProfile(userId: string | undefined): UsePersonalQCProfileResult {
  const [profile, setProfile] = useState<QCProfile | null>(null);

  useEffect(() => {
    if (!userId) return;
    loadPersonalQCProfile(userId).then(setProfile);
  }, [userId]);

  const save = async (p: QCProfile) => {
    if (!userId) return;
    await savePersonalQCProfile(userId, p);
    setProfile(p);
  };

  return { profile, save };
}
