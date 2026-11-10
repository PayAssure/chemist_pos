import type { RetailerProfileData } from "../types";
import { display, displayDateTime } from "./payassureUtils";

function ParticipantRecordCard({ profile }: { profile: RetailerProfileData }) {
  return (
    <article className="panel retailer-card">
      <div className="retailer-card-heading">
        <div><h2>PayAssure record</h2><p>Participant identity and onboarding state</p></div>
      </div>
      <dl className="retailer-fields">
        <div className="retailer-field"><dt>Participant ID</dt><dd>{display(profile.id)}</dd></div>
        <div className="retailer-field"><dt>Participant type</dt><dd>{display(profile.participantType)}</dd></div>
        <div className="retailer-field"><dt>Onboarding status</dt><dd>{display(profile.status)}</dd></div>
        <div className="retailer-field"><dt>Updated at</dt><dd>{displayDateTime(profile.updatedAt)}</dd></div>
      </dl>
    </article>
  );
}

export default ParticipantRecordCard;
