import { useEffect, useRef, useState } from "react";
import "./style.scss";

export default function ColumnFilter({ options, visibility, onToggle }) {
    const [isOpen, setIsOpen] = useState(false);
    const filterRef = useRef(null);
    const visibleCount = options.filter((option) => visibility[option.key]).length;

    useEffect(() => {
        function closeOnOutsideClick(event) {
            if (!filterRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        }

        function closeOnEscape(event) {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    return (
        <div className="column-filter" ref={filterRef}>
            <button
                className="column-filter__button"
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                onClick={() => setIsOpen((current) => !current)}
            >
                <span aria-hidden="true">☷</span>
                <span>Colunas</span>
                <small>{visibleCount}/{options.length}</small>
            </button>
            {isOpen && (
                <div className="column-filter__menu" role="dialog" aria-label="Colunas da tabela">
                    <h2>Colunas da tabela</h2>
                    <p>Escolha quais informações deseja exibir.</p>
                    <div className="column-filter__options">
                        {options.map((option) => {
                            const isVisible = Boolean(visibility[option.key]);
                            return (
                                <button
                                    className="column-filter__option"
                                    type="button"
                                    key={option.key}
                                    aria-pressed={isVisible}
                                    onClick={() => onToggle(option.key)}
                                >
                                    <span>{option.label}</span>
                                    <span className="column-filter__switch" aria-hidden="true">
                                        <span />
                                    </span>
                                    <small>{isVisible ? "Exibido" : "Oculto"}</small>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
