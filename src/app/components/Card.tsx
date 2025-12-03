import React from 'react';

type CardProps = {
  image: string;
  city: string;
  zip: string;
  address: string;
  badge: { letter: string; color: string };
  tags: string[];
};

const Card: React.FC<CardProps> = ({ image, city, zip, address, badge, tags }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col transition-transform duration-200 hover:shadow-xl hover:-translate-y-1 animate-fadein">
    <img src={image} alt={address} className="h-32 w-full object-contain" />
    <div className="p-4 flex-1 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <span>📍 {city}, {zip}</span>
        <span className={`ml-auto w-7 h-7 flex items-center justify-center rounded-full text-white font-bold text-base ${badge.color}`}>{badge.letter}</span>
      </div>
      <div className="font-semibold text-lg text-gray-900">{address}</div>
      <div className="flex flex-wrap gap-2 mt-2">
        {tags.map((tag, i) => (
          <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">{tag}</span>
        ))}
      </div>
    </div>
  </div>
);

export default Card; 