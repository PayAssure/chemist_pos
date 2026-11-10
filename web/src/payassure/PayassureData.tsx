import type { PayassureParticipantUpdate, RetailerProfileData } from "../types";
import BusinessProfileCard from "./BusinessProfileCard";
import IntegrationCard from "./IntegrationCard";
import ParticipantRecordCard from "./ParticipantRecordCard";
import PayassureEditDialog from "./PayassureEditDialog";
import SettlementCard from "./SettlementCard";
import { usePayassureEditor } from "./usePayassureEditor";

type PayassureDataProps = {
  profile: RetailerProfileData;
  loading: boolean;
  onSave: (update: PayassureParticipantUpdate) => Promise<RetailerProfileData>;
};

function PayassureData({ profile, loading, onSave }: PayassureDataProps) {
  const editor = usePayassureEditor(profile, onSave);
  return (
    <section className="management">
      <div className="alert alert-info" role="note">
        {loading ? "Loading participant data from PayAssure…"
          : profile.id ? "Participant data loaded from PayAssure. Saved changes are sent to PayAssure."
            : "No PayAssure participant data is available."}
      </div>
      <div className="retailer-cards">
        <BusinessProfileCard profile={profile} onEdit={() => editor.beginEdit("profile")} />
        <ParticipantRecordCard profile={profile} />
        <IntegrationCard profile={profile} />
        <SettlementCard profile={profile} onEdit={() => editor.beginEdit("payment")} />
      </div>
      {editor.editing && <PayassureEditDialog editor={editor} />}
    </section>
  );
}

export default PayassureData;
