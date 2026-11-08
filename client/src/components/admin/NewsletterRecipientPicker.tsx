import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function parseRecipientEmails(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export default function NewsletterRecipientPicker({
  value,
  onChange,
  emails,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  emails: string[];
  disabled?: boolean;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const parts = value.split(/[,;\n]/);
  const term = parts.at(-1)?.trim().toLowerCase() || "";
  const completed = new Set(
    parts.slice(0, -1).map((email) => email.trim().toLowerCase()),
  );
  const suggestions = emails
    .filter((email) => !completed.has(email) && email.includes(term))
    .slice(0, 8);
  const selected = parseRecipientEmails(value);
  const invalid = selected.filter((email) => !emails.includes(email));
  const open = focused && suggestions.length > 0 && !disabled;
  const choose = (email: string) => {
    onChange(
      [
        ...parts
          .slice(0, -1)
          .map((part) => part.trim())
          .filter(Boolean),
        email,
      ].join(", ") + ", ",
    );
    setHighlight(0);
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Recipients</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={open ? `${id}-option-${highlight}` : undefined}
          aria-describedby={`${id}-help ${id}-validation`}
          aria-invalid={invalid.length > 0}
          placeholder="Search an email or paste comma-separated addresses"
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            onChange(event.target.value);
            setHighlight(0);
            setFocused(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setFocused(false);
              return;
            }
            if (open && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "Enter")
                choose(suggestions[highlight] || suggestions[0]);
              else
                setHighlight(
                  (index) =>
                    (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      suggestions.length) %
                    suggestions.length,
                );
            }
          }}
        />
        {open && (
          <ul
            id={`${id}-suggestions`}
            role="listbox"
            aria-label="Subscribed email suggestions"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {suggestions.map((email, index) => (
              <li
                key={email}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={`cursor-pointer break-all rounded-sm px-3 py-2 text-sm ${index === highlight ? "bg-accent text-accent-foreground" : ""}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(email)}
              >
                {email}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        Choose a suggestion with Enter or a click. Separate addresses with
        commas. Only subscribed emails can receive newsletters.
      </p>
      <p
        id={`${id}-validation`}
        aria-live="polite"
        className={`text-xs ${invalid.length ? "text-destructive" : "text-muted-foreground"}`}
      >
        {invalid.length
          ? `Complete or remove these addresses; they are not in the subscribed list: ${invalid.join(", ")}`
          : `${selected.length} recipient${selected.length === 1 ? "" : "s"} selected. Duplicate addresses count once.`}
      </p>
    </div>
  );
}
