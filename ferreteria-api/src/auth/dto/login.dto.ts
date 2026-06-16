import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El usuario es obligatorio.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'El token de refresco es obligatorio.' })
  refresh: string;
}

export class LogoutDto {
  @IsString()
  refresh?: string;
}
