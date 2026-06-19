"use client";

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { subscribeToProtocols } from '@/lib/protocolService';
import { Protocol } from '@/types';

export function useProtocols(user: User | null): Protocol[] {
  const [protocols, setProtocols] = useState<Protocol[]>([]);

  useEffect(() => {
    if (!user) { setProtocols([]); return; }
    return subscribeToProtocols(user.uid, setProtocols);
  }, [user?.uid]);

  return protocols;
}
