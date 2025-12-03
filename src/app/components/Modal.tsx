import React from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const Modal: React.FC<ModalProps> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
};

export default Modal; 