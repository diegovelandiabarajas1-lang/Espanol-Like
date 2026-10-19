! comparar/mkl.f90 — las seis pruebas en Fortran con Intel MKL (CPU).
!   gfortran -O3 -march=native -fopenmp -I$MKL/include $MKL/include/mkl_dfti.f90 mkl.f90 \
!            -L$MKL/lib -l:libmkl_rt.so.N -Wl,-rpath,$MKL/lib -o mkl && ./mkl [chica]
! matmul con DGEMM, seno con la VML de MKL (vdSin), FFT con DFTI; x*2+1 y suma
! son expresiones de arreglos de Fortran, y softmax un bucle con OpenMP.
program comparar_mkl
  use MKL_DFTI
  implicit none
  integer, parameter :: dp = kind(1.0d0), i8 = selected_int_kind(18)
  integer :: ns(2), q, n, i, j, k, nv, sm, sk, nf, st
  real(dp), allocatable :: A(:,:), B(:,:), C(:,:), x(:), y(:), S(:,:), Y2(:,:)
  complex(dp), allocatable :: xc(:), Xf(:)
  real(dp) :: mejor, t, sx, m, tot
  integer(i8) :: c0, c1, tasa
  character(len=32) :: arg, tam
  logical :: chica
  type(DFTI_DESCRIPTOR), pointer :: h

  chica = .false.
  if (command_argument_count() > 0) then
    call get_command_argument(1, arg); chica = trim(arg) == 'chica'
  end if
  if (chica) then
    ns = [128, 256]; nv = 65536; sm = 256; nf = 16384
  else
    ns = [1024, 2048]; nv = 16777216; sm = 4096; nf = 1048576
  end if
  sk = 1024
  call system_clock(count_rate=tasa)

  do q = 1, 2
    n = ns(q)
    allocate(A(n, n), B(n, n), C(n, n))
    ! Fortran guarda por columnas: A(i+1, j+1) es la fila i, columna j de la fórmula
    do j = 0, n - 1
      do i = 0, n - 1
        A(i + 1, j + 1) = mod(i * 7 + j * 3, 13) / 13.0_dp - 0.5_dp
        B(i + 1, j + 1) = mod(i * 5 + j * 11, 17) / 17.0_dp - 0.5_dp
      end do
    end do
    call dgemm('N', 'N', n, n, n, 1.0_dp, A, n, B, n, 0.0_dp, C, n)
    mejor = 1.0d300
    do k = 1, 3
      call system_clock(c0)
      call dgemm('N', 'N', n, n, n, 1.0_dp, A, n, B, n, 0.0_dp, C, n)
      call system_clock(c1); t = real(c1 - c0, dp) * 1000.0_dp / real(tasa, dp); mejor = min(mejor, t)
    end do
    write(tam, '(I0)') n
    call res('matmul', tam, mejor, sum(C))
    deallocate(A, B, C)
  end do

  allocate(x(nv), y(nv))
  do i = 0, nv - 1
    x(i + 1) = mod(i, 1000) / 1000.0_dp
  end do
  write(tam, '(I0)') nv
  call vdsin(nv, x, y)
  mejor = 1.0d300
  do k = 1, 3
    call system_clock(c0); call vdsin(nv, x, y); call system_clock(c1)
    mejor = min(mejor, real(c1 - c0, dp) * 1000.0_dp / real(tasa, dp))
  end do
  call res('seno', tam, mejor, sum(y))
  y = x * 2.0_dp + 1.0_dp
  mejor = 1.0d300
  do k = 1, 3
    call system_clock(c0); y = x * 2.0_dp + 1.0_dp; call system_clock(c1)
    mejor = min(mejor, real(c1 - c0, dp) * 1000.0_dp / real(tasa, dp))
  end do
  call res('x*2+1', tam, mejor, sum(y))
  sx = sum(x)
  mejor = 1.0d300
  do k = 1, 3
    call system_clock(c0); sx = sum(x); call system_clock(c1)
    mejor = min(mejor, real(c1 - c0, dp) * 1000.0_dp / real(tasa, dp))
  end do
  call res('suma', tam, mejor, sx)

  ! softmax por filas: S(j, i) guarda la fila i (columnas seguidas en memoria)
  allocate(S(sk, sm), Y2(sk, sm))
  do i = 0, sm - 1
    do j = 0, sk - 1
      S(j + 1, i + 1) = mod(i * 3 + j, 50) / 10.0_dp
    end do
  end do
  mejor = 1.0d300
  do k = 0, 3
    call system_clock(c0)
    !$omp parallel do private(m, tot)
    do i = 1, sm
      m = maxval(S(:, i))
      Y2(:, i) = exp(S(:, i) - m)
      tot = sum(Y2(:, i))
      Y2(:, i) = Y2(:, i) / tot
    end do
    !$omp end parallel do
    call system_clock(c1)
    if (k > 0) mejor = min(mejor, real(c1 - c0, dp) * 1000.0_dp / real(tasa, dp))
  end do
  write(tam, '(I0,"x",I0)') sm, sk
  call res('softmax', tam, mejor, sum(Y2 * Y2))

  allocate(xc(nf), Xf(nf))
  do i = 0, nf - 1
    xc(i + 1) = cmplx(mod(i, 1000) / 1000.0_dp, 0.0_dp, dp)
  end do
  st = DftiCreateDescriptor(h, DFTI_DOUBLE, DFTI_COMPLEX, 1, nf)
  st = DftiSetValue(h, DFTI_PLACEMENT, DFTI_NOT_INPLACE)
  st = DftiCommitDescriptor(h)
  st = DftiComputeForward(h, xc, Xf)
  mejor = 1.0d300
  do k = 1, 3
    call system_clock(c0); st = DftiComputeForward(h, xc, Xf); call system_clock(c1)
    mejor = min(mejor, real(c1 - c0, dp) * 1000.0_dp / real(tasa, dp))
  end do
  st = DftiFreeDescriptor(h)
  write(tam, '(I0)') nf
  call res('fft', tam, mejor, sum(abs(Xf)))

contains
  subroutine res(prueba, tam, ms, huella)
    character(len=*), intent(in) :: prueba, tam
    real(dp), intent(in) :: ms, huella
    write(*, '(A,A,A,A,A,F0.6,A,ES25.17E3,A)') 'RES,', prueba, ',', trim(tam), ',cpu,', ms, ',', huella, ',f64'
    flush(6)
  end subroutine
end program
