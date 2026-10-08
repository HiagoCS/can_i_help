export function SettingsField({ label, required = false, children, className = "" }) {
    return (
        <label className={["settings__field", className].filter(Boolean).join(" ")}>
            <span>{label}{required ? " *" : ""}</span>
            {children}
        </label>
    );
}

export function SettingsSectionHeading({ title, description }) {
    return (
        <div className="settings__section-heading">
            <h2>{title}</h2>
            {description && <p>{description}</p>}
        </div>
    );
}

export function SettingsFeedback({ error, success }) {
    return (
        <>
            {error && <p className="settings__message settings__message--error" role="alert">{error}</p>}
            {success && <p className="settings__message settings__message--success" role="status">{success}</p>}
        </>
    );
}

export function SettingsActions({ children }) {
    return <div className="settings__actions">{children}</div>;
}
