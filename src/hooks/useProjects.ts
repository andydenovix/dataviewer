"use client";

import { useState, useEffect, useCallback } from 'react';
import { getUserProjects, Project } from '@/lib/projectService';

interface UseProjectsResult {
  projects: Project[];
  refresh: () => void;
}

export function useProjects(userId: string | undefined): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(() => {
    if (userId) getUserProjects(userId).then(setProjects);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { projects, refresh };
}
