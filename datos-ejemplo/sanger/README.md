# Cromatogramas de ejemplo (`#/sanger`)

Cuatro `.ab1` reales (16S, primers 27F/1492R) para probar el módulo de
secuenciación Sanger:

| Archivo | Qué es |
|---|---|
| `B13-27F.ab1` / `B13-1492R.ab1` | Par **limpio**: solapamiento forward/reverse alto y de identidad ~100 % — el botón "Cargar ejemplo (muestra limpia, B13)" produce un consenso fusionado sin avisos. |
| `B1-27F.ab1` / `B1-1492R.ab1` | Par que **necesita revisión manual**: con este amplicón (~1450 pb) el forward recortado y el reverse recortado no llegan a solaparse de verdad. Un alineador local sin ancla (el pipeline que este módulo sustituye) encontraba ahí un solapamiento espurio de baja identidad; este módulo, en cambio, no encuentra un ancla fiable y cae a "concatenado, pendiente de revisión" — el botón "Cargar ejemplo (necesita revisión manual, B1)" lo reproduce. |

Los códigos de muestra (`B13`, `B1`) son identificadores anónimos, sin
nombres ni metadatos identificables.

## Por qué estos `.ab1` NO son una copia byte a byte de los originales

Un `.ab1` real trae, además de la traza y la secuencia, un directorio de
decenas de campos de metadatos del instrumento y de la sesión de
secuenciación — nombre de usuario/operador, nombre del instrumento, fecha,
y **nombre del contenedor o placa**, que en la práctica suele incluir
nombres de persona o de laboratorio tal como los escribió quien cargó la
placa en el secuenciador. Los archivos originales de los que salen estos
ejemplos no son la excepción.

Por eso cada archivo de esta carpeta es una **reconstrucción mínima** del
original: un script (fuera de este repositorio, mismo principio que el resto
de `datos-ejemplo/` — ver el README de la carpeta padre) leyó el `.ab1`
real y escribió uno nuevo, válido, con **solo** estos campos:

- `PBAS2` — la secuencia llamada
- `PCON2` — la calidad Phred de cada base
- `FWO_1` — el orden de bases de los 4 canales de traza
- `DATA9`-`DATA12` — la traza normalizada de los 4 canales
- `PLOC2` — la posición de cada base en la traza
- `SPAC1` — el espaciado medio entre picos

Todo lo demás (usuario, instrumento, fecha, nombre de contenedor/placa,
LIMS…) se ha quitado por completo — no se ha vaciado ni sustituido por texto
genérico, simplemente no existe en el archivo. La secuencia, la calidad y la
traza son datos reales de un secuenciador, sin tocar.
