import { useEffect, useRef, useState } from "react";

export default function FormSelect({ id, name, value, options, onChange, disabled = false, invalid = false, describedBy }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const searchRef = useRef({ text: "", time: 0 });
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const listId = `${id}-options`;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  const choose = (index) => {
    onChange({ target: { name, value: options[index].value } });
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else { setActive(selected); setOpen(true); }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      let next = open ? active : selected;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (open) next = Math.max(0, Math.min(options.length - 1, next + (event.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      setOpen(true);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = (now - searchRef.current.time < 700 ? searchRef.current.text : "") + event.key.toLocaleLowerCase();
      searchRef.current = { text, time: now };
      const match = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(text));
      if (match >= 0) { setActive(match); setOpen(true); }
    }
  };

  return (
    <div className="openspots-form-select" ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <button id={id} ref={buttonRef} type="button" role="combobox"
        className="openspots-form-select-trigger" disabled={disabled}
        aria-expanded={open} aria-controls={listId} aria-haspopup="listbox"
        aria-invalid={invalid} aria-describedby={describedBy}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onKeyDown={onKeyDown} onClick={() => { setActive(selected); setOpen(!open); }}>
        <span>{options[selected].label}</span>
        <span className="openspots-form-select-arrow" aria-hidden="true" />
      </button>
      {open && <ul id={listId} role="listbox" aria-labelledby={id} className="openspots-form-select-menu">
        {options.map((option, index) => <li key={option.value} id={`${id}-option-${index}`}
          role="option" aria-selected={option.value === value}
          className={index === active ? "active" : undefined}
          onPointerMove={() => setActive(index)}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
          {option.label}
        </li>)}
      </ul>}
    </div>
  );
}
