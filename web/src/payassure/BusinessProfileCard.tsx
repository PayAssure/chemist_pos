import type { RetailerProfileData } from "../types";
import { display, profileFields } from "./payassureUtils";

function BusinessProfileCard({
  profile, onEdit,
}: { profile: RetailerProfileData; onEdit: () => void }) {
  return (
    <article className="panel retailer-card">
      <div className="retailer-card-heading">
        <div>
          <h2>Business &amp; contact details</h2>
          <p>Retailer identity and primary contact information</p>
        </div>
        <button className="button button-quiet" onClick={onEdit}>Edit</button>
      </div>
      <dl className="retailer-fields">
        {profileFields.map(({ key, label }) => (
          <div className="retailer-field" key={key}>
            <dt>{label}</dt><dd>{display(profile[key])}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default BusinessProfileCard;
