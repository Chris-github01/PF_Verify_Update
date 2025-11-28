interface SupplierNameInputProps {
  projectId?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export default function SupplierNameInput({ value, onChange, error }: SupplierNameInputProps) {
  return (
    <div className="w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Supplier name..."
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
      />
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
