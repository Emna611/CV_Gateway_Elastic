export function LogoMark({ size = 30 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path
                d="M9 12V10a1 1 0 0 1 1-1h2M20 9h2a1 1 0 0 1 1 1v2M23 20v2a1 1 0 0 1-1 1h-2M12 23h-2a1 1 0 0 1-1-1v-2"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
            />
            <circle cx="16" cy="16" r="3.2" fill="#fff" />
        </svg>
    );
}

export function OfficeIcon({ size = 22 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M3 21h18" />
            <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
            <path d="M15 21V9h3a2 2 0 0 1 2 2v10" />
            <path d="M8 7h2M8 11h2M8 15h2" />
        </svg>
    );
}

export function KitchenIcon({ size = 22 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M6 17V11.7A3.5 3.5 0 1 1 9.2 6.4a3.6 3.6 0 0 1 5.6 0A3.5 3.5 0 1 1 18 11.7V17z" />
            <path d="M6 17h12v3H6z" />
        </svg>
    );
}

export function ArrowRightIcon({ size = 16 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}
