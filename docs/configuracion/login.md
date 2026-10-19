# Configurar el acceso con código por email y con Google

Esta guía es para ti, sin conocimientos técnicos. Son pasos que haces tú en las webs de Supabase y de Google. Yo no puedo hacerlos por ti.

## 1. Código por email (Supabase)

1. Entra en [supabase.com](https://supabase.com), abre tu proyecto y ve a **Authentication** (Autenticación) y luego **Sign In / Providers**.
2. Comprueba que **Email** está activado. El código de un solo uso (OTP) viene activado por defecto.
3. Ve a **Authentication → Emails → Templates** (Plantillas) y abre la plantilla **Magic Link**.
4. Cambia el asunto por: `Tu código de acceso a ADNweb`
5. Sustituye todo el contenido del mensaje por este texto (la parte `{{ .Token }}` es el código de 6 dígitos y no se debe tocar):

```html
<h2>Tu código de acceso a ADNweb</h2>
<p>Escribe este código en la web para entrar:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">{{ .Token }}</p>
<p>Caduca en pocos minutos. Si no lo has pedido tú, ignora este mensaje.</p>
```

6. Pulsa **Save** (Guardar).

Nota: si dejas la plantilla original, el email llevará un enlace en lugar del código y el paso 2 no funcionará.

## 2. Direcciones permitidas (Supabase)

1. Ve a **Authentication → URL Configuration**.
2. En **Site URL** escribe: `http://localhost:3100` (por ahora, mientras pruebas en tu ordenador).
3. En **Redirect URLs** pulsa **Add URL** y añade: `http://localhost:3100/auth/callback`
4. Guarda.

Cuando publiques la web, repite este paso con tu dirección real, por ejemplo `https://tudominio.com` y `https://tudominio.com/auth/callback`.

## 3. Entrar con Google

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto (o usa uno existente).
2. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth**, elige **Externo** y rellena el nombre (ADNweb) y tu email.
3. Ve a **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
4. Tipo de aplicación: **Aplicación web**.
5. En **URI de redirección autorizados** añade esta dirección, cambiando `<ref>` por el identificador de tu proyecto de Supabase (lo ves en la dirección de tu proyecto, por ejemplo `abcdefgh`):

   `https://<ref>.supabase.co/auth/v1/callback`

6. Pulsa **Crear**. Google te mostrará un **ID de cliente** y un **Secreto de cliente**. Cópialos.
7. Vuelve a Supabase: **Authentication → Sign In / Providers → Google**. Actívalo, pega el ID de cliente y el secreto, y guarda.

## 4. Límite de emails

El envío de emails que trae Supabase por defecto está limitado a unos pocos emails por hora. Sirve para probar, pero antes de abrir la web al público hay que conectar un servicio de envío propio (SMTP) en **Authentication → Emails → SMTP Settings**. Cuando llegue ese momento, dímelo y te guío.

## 5. Comprobar que funciona

1. Arranca la web y abre `/login`.
2. Escribe tu email, pulsa **Continuar** y mira tu bandeja de entrada (y la carpeta de spam).
3. Escribe el código de 6 dígitos. Deberías entrar al panel.
4. Prueba también el botón **Google**.
