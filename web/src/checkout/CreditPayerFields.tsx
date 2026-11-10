type CreditPayerFieldsProps = {
  payerName: string;
  payerPhone: string;
  disabled: boolean;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
};

function CreditPayerFields({
  payerName, payerPhone, disabled, onNameChange, onPhoneChange,
}: CreditPayerFieldsProps) {
  return (
    <>
      <label className="prescription-field">
        Payer name
        <input value={payerName} disabled={disabled}
          onChange={(event) => onNameChange(event.target.value)}
          required maxLength={120} placeholder="Enter payer's full name" />
      </label>
      <label className="prescription-field">
        Payer phone number
        <input type="tel" value={payerPhone} disabled={disabled}
          onChange={(event) => onPhoneChange(event.target.value)}
          required minLength={7} maxLength={30} placeholder="Enter payer's phone number" />
      </label>
    </>
  );
}

export default CreditPayerFields;
