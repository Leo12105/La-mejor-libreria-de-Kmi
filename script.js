const quotes = [

'"Amar no es mirarse el uno al otro, sino mirar juntos en la misma dirección." — Antoine de Saint-Exupéry',

'"Donde reina el amor, sobran las leyes." — Platón',

'"El amor es la poesía de los sentidos." — Balzac',

'"Siempre hay algo de locura en el amor." — Nietzsche',

'"Te quiero para volvernos locos de risa." — Julio Cortázar',

'"Eres mi lugar favorito."',

'"Cada página contigo vale más que una biblioteca entera."'

];

document.getElementById("quote").innerText =
quotes[Math.floor(Math.random()*quotes.length)];

function scrollToLibrary(){
document.getElementById("library")
.scrollIntoView({
behavior:"smooth"
});
}

// PDF

document.getElementById("pdfInput")
.addEventListener("change", async function(e){

const file = e.target.files[0];

if(!file) return;

const data = await file.arrayBuffer();

const pdf = await pdfjsLib
.getDocument(data)
.promise;

const viewer =
document.getElementById("pdfViewer");

viewer.innerHTML="";

for(let i=1;i<=pdf.numPages;i++){

const page = await pdf.getPage(i);

const canvas =
document.createElement("canvas");

const ctx =
canvas.getContext("2d");

const viewport =
page.getViewport({
scale:1.4
});

canvas.width =
viewport.width;

canvas.height =
viewport.height;

await page.render({
canvasContext:ctx,
viewport
}).promise;

viewer.appendChild(canvas);

}
});

// EPUB

document.getElementById("epubInput")
.addEventListener("change", function(e){

const file = e.target.files[0];

if(!file) return;

const reader = new FileReader();

reader.onload = function(ev){

const book = ePub(ev.target.result);

const rendition =
book.renderTo(
"epubViewer",
{
width:"100%",
height:"100%"
}
);

rendition.display();

};

reader.readAsArrayBuffer(file);

});
