import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';

function CustomerConfirmDeleteModal({ isOpen, onClose, onConfirm, isSubmitting, customerName }) {
  return (
    <ConfirmDeleteModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      isSubmitting={isSubmitting}
      title="Delete Customer"
      confirmLabel="Delete Customer"
      message={(
        <>
          Are you sure you want to delete {customerName ? <strong>{customerName}</strong> : 'this customer'}?
        </>
      )}
    />
  );
}

export default CustomerConfirmDeleteModal;
