export function Marca({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display font-extrabold uppercase leading-none tracking-[0.005em] text-grafito ${className}`}
    >
      ADN<span className="text-teal">WEB</span>
    </span>
  );
}
