"use client";

import { useEffect, useId, useState } from "react";

export function TimezoneField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    // Free input remains available in older browsers; the server already
    // validates all IANA time zones, including aliases absent from this list.
    if (typeof Intl.supportedValuesOf === "function")
      setZones(Intl.supportedValuesOf("timeZone"));
  }, []);
  return (
    <div className="fe-field">
      <label htmlFor={id}>Fuseau horaire</label>
      <input
        id={id}
        name="timezone"
        value={value}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          try {
            new Intl.DateTimeFormat("fr", {
              timeZone: event.target.value,
            }).format();
            event.target.setCustomValidity("");
          } catch {
            event.target.setCustomValidity(
              "Choisis un fuseau IANA valide, par exemple Europe/Paris.",
            );
          }
        }}
        list={`${id}-zones`}
        required
        disabled={disabled}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
      />
      <datalist id={`${id}-zones`}>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ").replaceAll("/", " / ")}
          </option>
        ))}
      </datalist>
      <p className="fe-hint" id={`${id}-hint`}>
        Recherche une ville ou un fuseau, par exemple Paris ou Asia/Tokyo.
      </p>
    </div>
  );
}
