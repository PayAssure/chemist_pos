function SupplierContactFields() {
  return (
    <>
      <div className="supplier-contact-fields">
        <label>Contact name<input name="contactName" maxLength={120} placeholder="Supplier contact name" /></label>
        <label>Phone number<input name="phone" type="tel" maxLength={30} placeholder="Supplier phone number" /></label>
        <label>Email<input name="email" type="email" maxLength={254} placeholder="Supplier email address" /></label>
        <label>Address<input name="address" maxLength={300} placeholder="Supplier physical address" /></label>
      </div>
      <p className="helper-text">PayAssure merchant details are not needed for this supplier.</p>
    </>
  );
}

export default SupplierContactFields;
