"use client";

import { useState, useEffect, useCallback } from 'react';
import { getUserLabs, Lab } from '../components/labService';

interface UseLabsResult {
  labs: Lab[];
  refresh: () => void;
}

export function useLabs(userId: string | undefined): UseLabsResult {
  const [labs, setLabs] = useState<Lab[]>([]);

  const refresh = useCallback(() => {
    if (userId) getUserLabs(userId).then(setLabs);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { labs, refresh };
}
