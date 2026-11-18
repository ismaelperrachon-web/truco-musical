# Truco Oriental

Truco uruguayo multijugador con cartas musicales, interfaz oscura y diseño adaptable a celulares. React + Vite + Tailwind CSS, servidor Express + Socket.io. Sin registro, cuentas, contraseñas, servicios pagos ni claves de API.

## Ejecutar

Necesitás **Node.js 22.12 o superior** con npm. Desde esta carpeta:

```sh
npm install
npm run dev
```

Abrí **http://localhost:5173**. Un solo proceso sirve React, la API y Socket.io. El frontend se actualiza automáticamente; los cambios del servidor reinician el proceso y sus salas.

1. Ingresá tu apodo y creá una mesa **1 vs 1** o **2 vs 2**.
2. Copiá el enlace o abrí la invitación en WhatsApp.
3. Cada invitado entra desde su dispositivo con su apodo. También puede ingresar el código de ocho caracteres en la portada.
4. Cuando estén todos conectados, el anfitrión reparte. En 2v2 los asientos 1 y 3 son compañeros; 2 y 4 forman el otro equipo. Los equipos se ven antes de empezar.
5. Tocá una carta para jugar. Los botones muestran los cantos y respuestas válidos. El anfitrión inicia cada ronda y la revancha.

**En celulares dentro de la misma Wi-Fi:** usá `http://IP-DE-LA-PC:5173`, por ejemplo `http://192.168.1.20:5173`. Abrí primero esa dirección en la computadora para que el enlace de invitación también lleve la IP. `localhost` siempre apunta al dispositivo desde el que se abre. Windows puede pedir habilitar Node en la red privada; no hace falta abrir puertos del router para jugar por Wi-Fi. Para jugar desde redes diferentes, desplegá el proyecto.

Para probar dos jugadores en una computadora, abrí dos pestañas independientes e ingresá en ambas. **Recargar la misma pestaña recupera su asiento** mediante un token aleatorio en `sessionStorage`. Al perder conexión, se pausa la mesa hasta que vuelvan todos. El botón de salir concede la partida al equipo contrario si estaba en juego. Cerrar o recargar la pestaña solamente desconecta; no abandona.

El sonido está apagado inicialmente. Activá el ícono del parlante: Web Audio sintetiza los efectos al repartir, jugar y cantar, sin archivos externos.

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
- La flor se calcula con los **tres casos del pedido**: tres del mismo palo o al menos dos piezas. Una pieza más dos cartas del mismo palo distinto al de la pieza **no** forma flor en esta variante.
- **Convención de flor confirmada:** tres del mismo palo con una sola pieza suman el valor de la pieza y las otras dos cartas, **sin otros 20**. Con dos o tres piezas, se toma la mayor entera y las demás menos 20. Sin piezas, suma nominal + 20.
- Para evitar cobrar envido antes de una flor obligatoria de un compañero, todas las flores se anuncian **al inicio de la ronda**. Quienes no tienen flor esperan. Si ambos equipos tienen, se habilitan aceptación por 3, contraflor por 6 y contraflor al resto por la partida. Rechazar contraflor o resto paga 4.
- Flor simple o flor y flor sin subir dan **3 al ganador**, según el pedido; no se acumulan 3 por cada flor de un mismo equipo.
- Las cartas jugadas son públicas. Al aceptar envido o flor se publican los tantos declarados, **no las cartas sin jugar**. Cada jugador ve únicamente su propia mano y sus propios tantos.

Las mismas reglas están disponibles dentro de la aplicación.

## Verificación

```sh
npm test
npm run build
```

Las pruebas cubren jerarquía, sustitución del rey, envido y flor, todas las combinaciones relevantes de pardas, validación de turnos/cartas, pagos y cadenas de cantos, prioridad envido/truco, privacidad de las vistas, pausa por desconexión, reparto 2v2 y partidas completas simuladas. Una prueba de integración abre un servidor efímero y clientes Socket.io reales para verificar creación, ingreso, rechazo de intrusos, privacidad y reconexión.

## Estructura

```text
truco-musical/
├── src/
│   ├── main.jsx            # Portada, salas, mesa, tanteador y reglas
│   ├── cards.jsx           # Cartas e íconos SVG musicales
│   ├── sound.js            # Efectos con Web Audio
│   └── styles.css          # Tailwind y diseño adaptable
├── server/
│   ├── rules.js            # Funciones puras de reglas y barajado
│   ├── game.js             # Motor autoritativo y vistas por jugador
│   ├── index.js            # Express, Socket.io y salas
│   └── dev.js              # Servidor local con Vite integrado
├── test/
│   ├── rules.test.js
│   ├── game.test.js
│   └── network.test.js
├── index.html
├── vite.config.js
├── render.yaml
├── .env.example
├── package.json
└── README.md
```

Los eventos de juego verifican membresía, turno, carta, canto permitido y revisión del estado para rechazar acciones sobre una mesa desactualizada. Los tokens de reconexión nunca se envían a otros jugadores. Hay límites básicos de frecuencia, salas, apodos y tamaño de mensajes. El enlace permite ocupar un lugar libre; solo compartilo con quienes quieras invitar.
