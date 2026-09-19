
// Rotating highlight over business segments — one quiet, looping cue
var segs = document.querySelectorAll('#segments span');
var idx = 0;
function cycle(){
  segs.forEach(function(s){ s.classList.remove('on'); });
  segs[idx].classList.add('on');
  idx = (idx + 1) % segs.length;
} 
if (segs.length){
  cycle();
  setInterval(cycle, 1800);
}
// Front-end only demo validation — wire this to your PHP auth endpoint.
var form = document.getElementById('loginForm');
var errorMsg = document.getElementById('errorMsg');
form.addEventListener('submit', function(e){
  e.preventDefault();
  var login = document.getElementById('login').value.trim();
  var senha = document.getElementById('senha').value;
  if (!login || !senha){
    errorMsg.textContent = 'Preencha login e senha para continuar.';
    errorMsg.classList.add('show');
    return;
  }
  errorMsg.classList.remove('show');
  // TODO: substituir por chamada real, ex.:
  // fetch('/core/auth/login', { method: 'POST', body: new FormData(form) })
  console.log('Tentativa de login:', { login: login });
});
document.getElementById('forgotLink').addEventListener('click', function(e){
  e.preventDefault();
  alert('Ligue este link ao fluxo de recuperação de senha do seu Core.');
});
