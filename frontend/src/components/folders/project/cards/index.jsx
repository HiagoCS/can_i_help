import "./style.scss"
import { useState } from "react";

export default function Card({ project, onClick, images }) {
    const [currentImage, setCurrentImage] = useState(0);
    return (
        <div className="card" id="project">
            <div className="image">
                <div className="indicators">
                    {images.map((_, index) => (
                        <button key={index}
                            className={index === currentImage ? 'active' : ''}
                            onClick={() => setCurrentImage(index)} />
                    ))}
                </div>
                <img src={`${import.meta.env.VITE_API_URL}${images[currentImage]}`} loading="lazy" decoding="async" onClick={onClick} />
            </div>
            <div className="info" onClick={onClick}>
                <span className="title">
                    {project.title}
                </span>
                <span className="text">
                    {project.description}
                </span>
            </div>
        </div>
    );
}