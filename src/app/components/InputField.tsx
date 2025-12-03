import React from 'react';

type InputFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={props.id || props.name} className="text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`w-full px-6 py-4 rounded-2xl bg-white border-none shadow-lg text-base text-gray-800 focus:ring-2 focus:ring-purple-300 focus:outline-none placeholder:text-gray-500 transition ${className} ${error ? 'border border-red-400' : ''}`}
        {...props}
      />
      {error && <span className="text-red-500 text-sm mt-1">{error}</span>}
    </div>
  )
);
InputField.displayName = 'InputField';

export default InputField; 