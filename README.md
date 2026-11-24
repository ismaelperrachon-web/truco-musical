# Truco Oriental

Truco uruguayo multijugador con cartas musicales, interfaz oscura y diseño adaptable a celulares. React + Vite + Tailwind CSS, servidor Express + Socket.io. Sin registro, cuentas, contraseñas, servicios pagos ni claves de API.

## Ejecutar

Necesitás **Node.js 22.12 o superior** con npm. Desde esta carpeta:

```sh
npm install
npm run dev
```

Abrí **http://localhost:5173**. Un solo proceso sirve React, la API y Socket.io. El frontend se actualiza automáticamente; los cambios del servidor reinician el proceso y sus salas.

1. Ingresá tu apodo. La sección **Online** muestra las personas conectadas y las mesas públicas en tiempo real.
2. Para jugar solo, tocá **Jugar contra el bot**: se crea una práctica 1v1 y se reparten las cartas. Para jugar con amigos, tocá **Invitar** junto a una persona disponible o creá una mesa **1 vs 1** o **2 vs 2**.
3. Tu amigo puede tocar **Aceptar y jugar** en la invitación de esta misma página, o **Entrar a jugar** en tu mesa online. No hace falta escribir un código. El enlace, WhatsApp y el código de ocho caracteres siguen funcionando como alternativas.
4. Cuando estén todos conectados, el anfitrión reparte. En 2v2 los asientos 1 y 3 son compañeros; 2 y 4 forman el otro equipo. Los equipos se ven antes de empezar.
5. Tocá una carta para jugar. Los botones muestran los cantos y respuestas válidos. El anfitrión inicia cada ronda y la revancha.

**En celulares dentro de la misma Wi-Fi:** usá `http://IP-DE-LA-PC:5173`, por ejemplo `http://192.168.1.20:5173`. Abrí primero esa dirección en la computadora para que el enlace de invitación también lleve la IP. `localhost` siempre apunta al dispositivo desde el que se abre. Windows puede pedir habilitar Node en la red privada; no hace falta abrir puertos del router para jugar por Wi-Fi. Para jugar desde redes diferentes, desplegá el proyecto.

Para probar dos jugadores en una computadora, abrí dos pestañas independientes e ingresá en ambas. **Recargar la misma pestaña recupera su asiento** mediante un token aleatorio en `sessionStorage`. Al perder conexión, se pausa la mesa hasta que vuelvan todos. El botón de salir concede la partida al equipo contrario si estaba en juego. Cerrar o recargar la pestaña solamente desconecta; no abandona.

## Bot, personas online y espectadores

- **Práctica rápida:** el botón del bot inicia un 1v1 sin esperar a otra persona. El bot juega y responde cantos en el servidor, con una estrategia de fuerza de cartas y tantos. Utiliza exclusivamente su propia vista de jugador y las cartas públicas, sin consultar manos rivales. Sus jugadas esperan a que se lean los carteles.
- **Completar mesas:** antes de repartir, el anfitrión puede agregar o quitar bots en los lugares libres, también para armar un 2v2. Los bots están identificados con su ícono y no cuentan como personas conectadas. No se pueden sustituir jugadores ni quitar bots durante una partida.
- **Personas conectadas:** los apodos aparecen al escribirlos y desaparecen al desconectarse. Podés buscar a tu amigo por apodo. No hay cuentas ni una lista persistente de amistades: la presencia corresponde a las sesiones abiertas.
- **Invitar en un toque:** desde la portada, «Invitar» crea una mesa con la modalidad y visibilidad elegidas y envía una invitación dentro de la aplicación. Desde la espera se usa la mesa actual. La invitación dura un minuto; el ingreso valida que todavía quede lugar. Se limita la frecuencia de invitaciones.
- **Públicas y privadas:** las mesas nuevas son públicas por defecto y se listan con apodos, lugares, tanteador y cantidad de espectadores. Desmarcá «Mesa pública» para ocultarla del directorio. En una mesa privada, tu apodo sigue mostrando «Mesa privada» pero no se publica su código. Podés compartir el enlace o enviar una invitación directamente. La privacidad es por enlace no listado; no hay contraseña.
- **Mirar partidas:** en Online, tocá «Mirar partida» o «Ver mesa». El espectador ve el tanteador, la muestra, los cantos, sus resultados públicos y las cartas jugadas. No recibe manos sin jugar ni tantos privados y el servidor rechaza cualquier intento suyo de jugar o editar bots. Su entrada, salida o desconexión no pausa la partida ni cambia el turno.
- **Del público a la mesa:** si todavía no se repartió y hay lugar, el espectador puede tocar «Sentarme a jugar». Si la mesa se completó mientras tanto, conserva su vista de espectador.
- **Reconexión:** recargar conserva el rol de jugador o espectador en la misma pestaña. Si el único jugador humano se desconecta, los bots se pausan hasta que vuelve. Si el último humano abandona expresamente la mesa, se cierra también para los espectadores.

Los efectos están habilitados y se desbloquean con la primera interacción, según las restricciones de audio del navegador. El parlante permite silenciarlos. Cada carta produce un roce y un golpe sintetizados sobre el paño; también hay efectos al repartir, cantar y resolver tantos.

El control **Cumbia** de la esquina superior prende o apaga una base instrumental chill sintetizada con Web Audio a 84 BPM: bajo suave, guacharaca, congas y melodía cálida con armónicos de acordeón. Empieza apagada, al 30% de volumen. Su deslizador funciona de manera independiente: bajar o apagar la música no corta los efectos, y silenciar las cartas no corta la música. No requiere archivos MP3, descargas ni servicios externos.

Los cantos y cartas aparecen en grande durante **2,5 segundos**, en orden para todos los jugadores. La carta se destaca antes de incorporarse a la mesa. Los controles de juego esperan a que terminen los anuncios; los controles de audio siguen disponibles. Al aceptar envido o flor, el resultado muestra los tantos de cada jugador, quién ganó, si hubo desempate por prioridad de mano y cuántos puntos se otorgaron. Dura **6,5 segundos**, puede cerrarse con «Seguir jugando» y puede volver a abrirse desde **Ver resultado** durante esa ronda. Las personas sin flor se indican con «Sin flor». Al recargar se conserva el resultado y no se repiten los carteles antiguos.

## Producción local

```sh
npm run build
npm start
```

Abrí **http://localhost:3000**. `/health` devuelve `{"status":"ok"}`. Podés copiar `.env.example` a `.env` para cambiar `PORT`. No necesitás `CLIENT_ORIGIN` cuando servís todo desde el mismo dominio.

## Desplegar gratis en Render

La opción recomendada es un **Web Service de Node**, que sirve tanto el frontend como los WebSockets. No uses un sitio estático para el backend.

1. Subí **el contenido de esta carpeta** a un repositorio de GitHub, sin `node_modules`, `.env` ni `dist`.
2. En [Render](https://render.com), creá un **New → Web Service** y conectá ese repositorio. Si subiste el proyecto entero de `simulacro`, configurá **Root Directory: `truco-musical`**; si subiste solo esta carpeta, dejalo vacío.
3. Elegí el plan **Free**, runtime **Node** y Node 22.16 o superior.
4. **Build Command:** `npm ci && npm run build`.
5. **Start Command:** `npm start`. **Health Check Path:** `/health`.
6. Render inyecta `PORT`. No fijes un puerto manualmente. Al finalizar tendrás una dirección `https://tu-servicio.onrender.com`.
7. Abrí esa URL, creá una mesa y compartí su enlace. El HTTPS de Render también habilita copiar al portapapeles desde el celular.

Se incluye `render.yaml` para desplegar mediante **Blueprints** si esta carpeta es la raíz del repositorio. Revisá el plan disponible antes de crear el servicio.

[Render Free](https://render.com/docs/free) puede suspender el servicio tras 15 minutos sin tráfico; la primera visita puede tardar en despertarlo. [Render admite WebSockets](https://render.com/docs/websocket) en Web Services. Estas condiciones fueron consultadas el 18/11/2026 y pueden cambiar.

**Estado en memoria:** reiniciar, redesplegar o suspender el proceso elimina las salas. Este proyecto está preparado para **una sola instancia**. No requiere base de datos. Las salas con todos los jugadores desconectados vencen tras dos horas; un anfitrión desconectado conserva su lugar. Para persistencia o múltiples instancias harían falta almacenamiento compartido y un adaptador Socket.io.

El mismo build/start puede ejecutarse como servicio Node en otros proveedores. Este proyecto se entrega para un proceso único, con salas en memoria. [Vercel ya admite WebSockets en Functions](https://vercel.com/changelog/websocket-support-is-now-generally-available), pero desplegar allí todo el backend requeriría adaptar el arranque y compartir el estado entre instancias; ese despliegue no está configurado aquí. Si alojás solo el frontend en Vercel, definí `VITE_SERVER_URL=https://tu-backend` antes de compilar el cliente y `CLIENT_ORIGIN=https://tu-frontend` en el servicio Node. La opción de un solo servicio evita esa configuración.

## Reglas y decisiones explícitas

- Mazo español de 40 cartas; barajado con `node:crypto`. Tres cartas por jugador y una muestra, sin repetir.
- Piezas: 2, 4, 5, 11 y 10 del palo de la muestra. El 12 sustituye exactamente a la pieza que salió de muestra, tanto en fuerza como en puntos.
- Jerarquía completa, pardas, mejor de tres y prioridad de mano. En parejas se compara el mejor integrante; los empates se resuelven por orden circular desde mano.
- Partidas a 30, truco/retruco/vale cuatro, derechos alternados de subida y pagos al rechazar.
- Envido durante la primera baza, incluso como respuesta previa a un truco pendiente. Hasta dos envidos, luego un real y finalmente una falta; después de real no se vuelve a envido. La falta **reemplaza** lo acumulado: gana la partida si ambos van en malas; en buenas vale la distancia del líder hasta 30. Rechazar una subida paga el acumulado anterior; un primer canto rechazado paga 1.
- Hay flor con tres cartas del mismo palo, dos o tres piezas, **o una pieza y otras dos cartas del mismo palo entre sí**, aunque ese palo sea distinto al de la muestra.
- Con una sola pieza se suma su valor y el nominal de las otras dos cartas, **sin otros 20**; las figuras comunes valen 0. Ejemplo: pieza del 4 (29) + 6 y 2 de guitarras = **37 de flor**. El rey que sustituye una pieza sigue la misma regla. Con dos o tres piezas, se toma la mayor entera y las demás menos 20. Sin piezas, suma nominal + 20.
- Para evitar cobrar envido antes de una flor obligatoria de un compañero, todas las flores se anuncian **al inicio de la ronda**. Quienes no tienen flor esperan. Si ambos equipos tienen, se habilitan aceptación por 3, contraflor por 6 y contraflor al resto por la partida. Rechazar contraflor o resto paga 4.
- Flor simple o flor y flor sin subir dan **3 al ganador**, según el pedido; no se acumulan 3 por cada flor de un mismo equipo.
- Las cartas jugadas son públicas. Al aceptar envido o flor se publican los tantos declarados, **no las cartas sin jugar**. Cada jugador ve únicamente su propia mano y sus propios tantos.

Las mismas reglas están disponibles dentro de la aplicación.

## Verificación

```sh
npm test
npm run build
```

Las pruebas cubren jerarquía, sustitución del rey, la flor de una pieza y dos del mismo palo en los cuatro palos, figuras comunes, pardas, turnos/cartas, pagos y cadenas de cantos, prioridad envido/truco, resultados y desempates, privacidad de las vistas, pausa por desconexión, reparto 2v2 y partidas completas simuladas. Las pruebas de integración abren servidores efímeros y clientes Socket.io reales para verificar creación, ingreso, rechazo de intrusos, reconexión y entrega del mismo resultado de contraflor a ambos jugadores. También se verifican la deduplicación de anuncios y la independencia de los canales de audio con un contexto simulado.

Las pruebas de comunidad verifican bots autónomos, partidas completas de bots en 1v1 y 2v2, directorio público y presencia, ocultamiento de códigos privados, invitaciones y ocupación de asientos, restricciones de los espectadores, entrada/salida sin pausa y recuperación tras desconexiones.

## Estructura

```text
truco-musical/
├── src/
│   ├── main.jsx            # Entrada React y estilos
│   ├── App.jsx             # Portada, salas, mesa, tanteador y reglas
│   ├── OnlineLobby.jsx     # Personas, mesas e invitaciones rápidas
│   ├── community.css       # Directorio online y modo espectador
│   ├── cards.jsx           # Cartas e íconos SVG musicales
│   ├── sound.js            # Efectos con Web Audio
│   ├── AudioControls.jsx   # Música y efectos con controles independientes
│   ├── announcements.jsx   # Carteles, animación de cartas y resultados
│   ├── tableEvents.js      # Cursor y deduplicación de eventos públicos
│   ├── table-feedback.css  # Estilos de carteles y controles de audio
│   └── styles.css          # Tailwind y diseño adaptable
├── server/
│   ├── rules.js            # Funciones puras de reglas y barajado
│   ├── game.js             # Motor autoritativo y vistas por jugador
│   ├── bot.js              # Estrategia con información propia y pública
│   ├── index.js            # Express, Socket.io y salas
│   └── dev.js              # Servidor local con Vite integrado
├── test/
│   ├── rules.test.js
│   ├── game.test.js
│   ├── network.test.js
│   ├── bot.test.js
│   ├── community.test.js
│   ├── table-events.test.js
│   └── sound.test.js
├── index.html
├── vite.config.js
├── render.yaml
├── .env.example
├── package.json
└── README.md
```

Los eventos de juego verifican membresía, turno, carta, canto permitido y revisión del estado para rechazar acciones sobre una mesa desactualizada. Los tokens de reconexión nunca se envían a otros jugadores. Hay límites básicos de frecuencia, salas, apodos y tamaño de mensajes. El enlace permite ocupar un lugar libre; solo compartilo con quienes quieras invitar.
