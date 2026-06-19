"use client";

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { subscribeToReferenceSpectra } from '@/lib/referenceSpectraService';
import { ReferenceSpectrum } from '@/types';

export function useReferenceSpectra(user: User | null): ReferenceSpectrum[] {
  const [refs, setRefs] = useState<ReferenceSpectrum[]>([]);

  useEffect(() => {
    if (!user) { setRefs([]); return; }
    return subscribeToReferenceSpectra(user.uid, setRefs);
  }, [user?.uid]);

  return refs;
}
