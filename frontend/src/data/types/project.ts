export interface ProjectModal {
  id: number;
  projectId: number;
  text: string;
  extension: string;
}

export interface Project {
  id: number;
  title: string;
  description: string;
  externalUrl: string | null;
  typeId: number;
  status: boolean;
  modal: ProjectModal[];
}