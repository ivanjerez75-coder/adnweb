import { empezar } from "./landing-actions";

export default function Home() {
  return (
    <main>
      <h1>DNAweb</h1>
      <form action={empezar}>
        <input type="text" name="url" placeholder="https://tuweb.com" required aria-label="URL" />
        <button type="submit">Analizar</button>
      </form>
    </main>
  );
}
