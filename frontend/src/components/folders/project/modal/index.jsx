import "./style.scss";
import { useEffect, useState } from "react";
import ArrowRight from '@/assets/icons/arrow-right-svgrepo-com.svg?react';
import ArrowLeft from '@/assets/icons/arrow-left-svgrepo-com.svg?react';
import CloseIcon from '@/assets/icons/close-svgrepo-com.svg?react';

export default function modal({ project, onClose, images }) {
    console.log(images);
    const [currentIndex, setCurrentIndex] = useState(0);

    const modal = project.modal;

    const sortedImages = [...images].sort((a, b) => {
        const getNumber = (path) => {
            const fileName = path.split("/").pop() ?? "";
            const match = fileName.match(/^\d+/);

            return match ? Number(match[0]) : Infinity;
        };

        return getNumber(a) - getNumber(b);
    });
    const currentItem = modal[currentIndex];
    const image = sortedImages[currentIndex];
    const next = () => {
        setCurrentIndex((current) =>
            current === modal.length - 1 ? 0 : current + 1
        );
    };

    const previous = () => {
        setCurrentIndex((current) =>
            current === 0 ? modal.length - 1 : current - 1
        );
    };

    useEffect(() => {
        const handleKeyDown = (event) => {

            if (event.key === "Escape") {
                onClose();
            }

            if (event.key === "ArrowRight") {
                next();
            }

            if (event.key === "ArrowLeft") {
                previous();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [modal.length]);

    return (
        <div className="modal">
            <div className="close" onClick={onClose}>
                <CloseIcon style={{width:'2.5vw', height:'2.5vh'}} />
            </div>
            <div className="previous" onClick={previous}>
                <ArrowLeft style={{width:'2.5vw', height:'2.5vh'}} />
            </div>

            <div className="modal-content">

                <div className="image">
                    {image && (
                        <img
                            src={`${import.meta.env.VITE_API_URL}${image}`}
                            alt={currentItem.text}
                        />
                    )}
                </div>

                <div className="info">

                    <h2>{project.title}</h2>

                    <span>
                        {currentItem.text}
                    </span>

                    <div className="counter">
                        {currentIndex + 1} / {modal.length}
                    </div>

                </div>

            </div>
            <div className="next" onClick={next}>
                <ArrowRight style={{width:'2.5vw', height:'2.5vh'}}></ArrowRight>
            </div>
        </div>
    );
}