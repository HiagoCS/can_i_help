import "./style.scss"
import { useState } from "react";
import { useLocation } from 'react-router-dom';

import Card from "./cards/index"
import Modal from "./modal/index";
import { useProjects } from "@/data/hooks/useProjects";
import { useProjectImages } from "@/data/hooks/useProjectImages";
export default function projectPage({ type }) {
    const [selectedProject, setSelectedProject] = useState(null);
    const [hasModal, setHasModal] = useState(false);
    const [imagesGlob, setImagesGlob] = useState([]);
    const { data: projects, isLoading, error } = useProjects(type);
    const imageQueries = useProjectImages(projects);
    if (isLoading && useLocation().pathname !== "/") return <p>Loading...</p>
    if (error && useLocation().pathname !== "/") return <p>{error.message}</p>
    if (!projects?.length) return (useLocation().pathname !== "/" ? <p>Nenhum projeto encontrado!</p> : null)

    if (selectedProject)
        console.log(selectedProject)
    return (
        <div className={`project ${type}`}>

            {

                projects.map((project, index) => {
                    const images = imageQueries[index]?.data?.images ?? [];
                    return (
                        <Card
                            key={project.id}
                            project={project}
                            images={images}
                            onClick={() => {
                                if (project.modal.length > 0) setHasModal(true);
                                setSelectedProject(project)
                                setImagesGlob(imageQueries[index]?.data?.modal ?? [])
                            }} />
                    )
                })
            }
            {
                /* & selectedProject.modal.length > 0  */
                selectedProject && hasModal && (
                    <Modal
                        project={selectedProject}
                        onClose={() => setSelectedProject(null)}
                        images={imagesGlob}
                    />
                )
            }
        </div>
    )
}