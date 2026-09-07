export type ApprovalKind = 'plan' | 'launch';
export type ApprovalState = 'pending' | 'approved' | 'changes_requested' | 'withdrawn' | 'superseded' | 'stale';
export type Approval = {
  id: string; client_id: string; track_id: string; request_number: number; kind: ApprovalKind;
  item_id: string; version_id: string | null; item_title: string; item_url: string | null;
  version_label: string; scope: string; consent_text: string; requested_at: string;
  decision: 'approved' | 'changes_requested' | null; response_comment: string | null;
  responder_name: string | null; responder_email: string | null; responded_at: string | null;
  state: ApprovalState; source_available: boolean;
};
export const approvalLabels: Record<ApprovalState, string> = {
  pending: 'Approval requested', approved: 'Approved', changes_requested: 'Changes requested',
  withdrawn: 'Withdrawn', superseded: 'Superseded', stale: 'Fresh approval needed',
};
export const approvalTitle = (kind: ApprovalKind) => kind === 'plan' ? 'Plan approval' : 'Permission to launch';
export function approvalDate(value: string) {
  return new Date(value).toLocaleString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}) + ' (London)';
}
