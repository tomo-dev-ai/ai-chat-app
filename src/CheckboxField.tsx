type CheckboxFieldProps = {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function CheckboxField({ name, label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export default CheckboxField;