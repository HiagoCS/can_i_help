export default function BannerIllustration({ className = "" }) {
    return (
        <svg
            className={className}
            viewBox="0 0 700 500"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="Ilustração de desenvolvimento de software"
        >
            {/* Área decorativa */}
            <g opacity="0.35">
                <circle
                    cx="350"
                    cy="250"
                    r="170"
                    fill="#DCEFFF"
                />

                <circle
                    cx="470"
                    cy="180"
                    r="110"
                    fill="#EAF6FF"
                />

                <circle
                    cx="260"
                    cy="330"
                    r="90"
                    fill="#EAF6FF"
                />
            </g>

            {/* Elementos flutuantes */}
            <g
                fill="#FFFFFF"
                stroke="#8CCBFF"
                strokeWidth="3"
            >
                <rect
                    x="120"
                    y="100"
                    width="150"
                    height="90"
                    rx="18"
                />

                <rect
                    x="470"
                    y="75"
                    width="90"
                    height="90"
                    rx="18"
                />

                <rect
                    x="570"
                    y="190"
                    width="90"
                    height="90"
                    rx="18"
                />

                <rect
                    x="470"
                    y="305"
                    width="90"
                    height="90"
                    rx="18"
                />
            </g>

            {/* Janela de código */}
            <g>
                <rect
                    x="140"
                    y="115"
                    width="110"
                    height="10"
                    rx="5"
                    fill="#69B8FF"
                />

                <circle cx="145" cy="145" r="5" fill="#69B8FF" />
                <circle cx="165" cy="145" r="5" fill="#69B8FF" />
                <circle cx="185" cy="145" r="5" fill="#69B8FF" />

                <rect
                    x="145"
                    y="160"
                    width="70"
                    height="6"
                    rx="3"
                    fill="#B5DFFF"
                />
            </g>

            {/* Ícone de código */}
            <g
                fill="none"
                stroke="#49A9FF"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M495 105 L475 120 L495 135" />
                <path d="M535 105 L555 120 L535 135" />
                <path d="M525 100 L505 140" />
            </g>

            {/* Laptop */}
            <g>
                {/* Tela */}
                <rect
                    x="190"
                    y="190"
                    width="320"
                    height="210"
                    rx="25"
                    fill="#FFFFFF"
                    stroke="#8CCBFF"
                    strokeWidth="8"
                />

                {/* Moldura interna */}
                <rect
                    x="215"
                    y="215"
                    width="270"
                    height="160"
                    rx="10"
                    fill="#21364F"
                />

                {/* Código na tela */}
                <g
                    strokeLinecap="round"
                    strokeWidth="7"
                >
                    <line
                        x1="245"
                        y1="250"
                        x2="300"
                        y2="250"
                        stroke="#6BBEFF"
                    />

                    <line
                        x1="245"
                        y1="275"
                        x2="365"
                        y2="275"
                        stroke="#55708E"
                    />

                    <line
                        x1="270"
                        y1="300"
                        x2="420"
                        y2="300"
                        stroke="#6BBEFF"
                    />

                    <line
                        x1="245"
                        y1="325"
                        x2="350"
                        y2="325"
                        stroke="#55708E"
                    />

                    <line
                        x1="270"
                        y1="350"
                        x2="390"
                        y2="350"
                        stroke="#6BBEFF"
                    />
                </g>

                {/* Base do notebook */}
                <path
                    d="
                        M155 400
                        H545
                        L585 430
                        H115
                        Z
                    "
                    fill="#FFFFFF"
                    stroke="#8CCBFF"
                    strokeWidth="7"
                    strokeLinejoin="round"
                />

                {/* Touchpad */}
                <rect
                    x="310"
                    y="408"
                    width="80"
                    height="8"
                    rx="4"
                    fill="#8CCBFF"
                />
            </g>

            {/* Ícone React */}
            <g
                fill="none"
                stroke="#49A9FF"
                strokeWidth="5"
            >
                <ellipse
                    cx="615"
                    cy="115"
                    rx="35"
                    ry="14"
                />

                <ellipse
                    cx="615"
                    cy="115"
                    rx="35"
                    ry="14"
                    transform="rotate(60 615 115)"
                />

                <ellipse
                    cx="615"
                    cy="115"
                    rx="35"
                    ry="14"
                    transform="rotate(120 615 115)"
                />

                <circle
                    cx="615"
                    cy="115"
                    r="6"
                    fill="#49A9FF"
                />
            </g>

            {/* Ícone JS */}
            <g>
                <rect
                    x="590"
                    y="205"
                    width="50"
                    height="50"
                    rx="8"
                    fill="#FFFFFF"
                    stroke="#49A9FF"
                    strokeWidth="4"
                />

                <text
                    x="615"
                    y="239"
                    textAnchor="middle"
                    fontSize="24"
                    fontWeight="700"
                    fontFamily="Arial, sans-serif"
                    fill="#49A9FF"
                >
                    JS
                </text>
            </g>

            {/* Banco de dados */}
            <g
                fill="#FFFFFF"
                stroke="#49A9FF"
                strokeWidth="4"
            >
                <ellipse
                    cx="615"
                    cy="320"
                    rx="27"
                    ry="10"
                />

                <path
                    d="
                        M588 320
                        V355
                        C588 367 642 367 642 355
                        V320
                    "
                />

                <ellipse
                    cx="615"
                    cy="355"
                    rx="27"
                    ry="10"
                />
            </g>

            {/* Planta */}
            <g>
                <path
                    d="M120 400 C95 355 105 325 135 300"
                    fill="none"
                    stroke="#69B8FF"
                    strokeWidth="7"
                    strokeLinecap="round"
                />

                <path
                    d="M120 400 C145 365 155 330 145 290"
                    fill="none"
                    stroke="#69B8FF"
                    strokeWidth="7"
                    strokeLinecap="round"
                />

                <ellipse
                    cx="105"
                    cy="330"
                    rx="18"
                    ry="35"
                    transform="rotate(-35 105 330)"
                    fill="#69B8FF"
                />

                <ellipse
                    cx="145"
                    cy="315"
                    rx="18"
                    ry="35"
                    transform="rotate(35 145 315)"
                    fill="#69B8FF"
                />

                <path
                    d="M90 400 H150 L140 440 H100 Z"
                    fill="#FFFFFF"
                    stroke="#8CCBFF"
                    strokeWidth="5"
                />
            </g>

            {/* Linha de base */}
            <line
                x1="80"
                y1="450"
                x2="650"
                y2="450"
                stroke="#8CCBFF"
                strokeWidth="4"
                strokeLinecap="round"
            />

            {/* Pequenos detalhes */}
            <g fill="#69B8FF">
                <circle cx="95" cy="220" r="6" />
                <circle cx="570" cy="80" r="6" />
                <circle cx="660" cy="310" r="5" />
                <circle cx="350" cy="100" r="5" />
            </g>
        </svg>
    );
}